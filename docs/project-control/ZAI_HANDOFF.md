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
- **From Phase 6 onward** the canonical correction-handoff form is `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` (established by Phase 6 — Correction and Issue-Control Workflow, 2026-10-01; the durable workflow contract is `VERIFICATION_STATE.md` §"Correction and issue-control workflow"; the issue schema/lifecycle/severity model is `ISSUES.md` §"Issue-control system"). A corrective handoff instance is materialized from that template into Part II of this file (annotating or replacing the active instance per §I.12), referencing the related `ISSUES.md` issue ID; the issue's lifecycle status and the correction's status are kept consistent per the issue/phase status relationship (`ISSUES.md` §4). The pre-Phase-6 corrective cycles (Phases 0, 4, and 5) stand as recorded under the convention then in force.

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

- `docs/project-control/templates/PHASE_HANDOFF_TEMPLATE.md` is the single canonical blank phase-handoff form (Phase 0 report §10; plan Phase 2). No other handoff template may be created; no duplicate handoff source may exist (`git ls-files` must show exactly one handoff protocol file and one phase-handoff template file under `docs/project-control/`).
- `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` is the single canonical correction-handoff form (established by Phase 6, 2026-10-01; the appendix variant in the phase template is superseded from Phase 6 onward and remains only as the historical record of the Phase 0–5 convention). Corrective-handoff instances are materialized from it into Part II of this file per §I.5.
- New instances are created by filling the template from the architect's issued handoff and replacing Part II of this file as the first implementation task of the new phase.
- Superseded instances are NOT kept as separate files (that would create competing sources of truth); they remain recoverable in Git history, and from Phase 4 onward in the canonical worklog.

---

## Part II — Active Handoff Instance

> **Corrective handoff instance CH-001** — materialized from `docs/project-control/templates/CORRECTION_HANDOFF_TEMPLATE.md` per Part I §I.5/§I.12 on 2026-10-01, replacing the Phase 6 implementation instance (superseded; recoverable in Git history at `c0cca964064286c25dcf22c8f86038baaacd7ebe` and identified in the canonical `worklog.md` Phase 6 entry). Related issue: `ISSUES.md` §"Issue records (canonical schema)" **I-013**. This instance authorizes **only the corrective scope (§11)** — it does not authorize unrelated improvements, unrelated project-control state changes, or the next phase.

### 1. Correction identity

| Field | Value |
|---|---|
| Correction ID | `CH-001` (the first corrective handoff under the Phase 6 issue-control system; sequential from `CH-001`; never reused) |
| Correction title | Correct the Phase 6 P2/P3 closure policy — remove the P2/P3 exception path that contradicts the Phase 5 closure-eligibility contract (R6) |
| Current status | `CLOSED` — architect re-review `PASS` (2026-10-01): first review `CORRECTION_REQUIRED` → the correction was delivered as the commit `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884` ("docs: correct phase 6 p2 p3 closure policy", the immediate child of the correction baseline `c0cca964064286c25dcf22c8f86038baaacd7ebe`) → re-review `PASS` → issue I-013 → `RESOLVED` (architect-verified disposition) → Phase 6 `CLOSED`. The handoff is fully executed (correction + re-review + resolution + closure; see the Closure record below) |
| Issued by | ChatGPT (architect / technical lead / reviewer / controller) |
| Issue date | 2026-10-01 |
| Repository | `Rilan-Dev/Clara-AI-Platform` (GitHub, private) |
| Branch | `feature/ai-core-from-doable-source` |

### 2. Related issue ID

| Field | Value |
|---|---|
| Issue ID | `I-013` — `ISSUES.md` §"Issue records (canonical schema)" (the issue's lifecycle state and this correction's status are kept consistent per `ISSUES.md` §4) |
| Issue severity | `P1` (architect-assigned at triage — a governance-contract correctness problem affecting phase-closure semantics; deliberately not P0 merely because it blocks Phase 6) |
| Issue status at issuance | `CORRECTION_REQUIRED` (architect triage: `OPEN → TRIAGED → CORRECTION_REQUIRED`, 2026-10-01) |
| Related prior corrections | none (the first correction cycle on this issue) |

### 3. Related phase

| Field | Value |
|---|---|
| Phase number / name | Phase 6 — Correction and Issue-Control Workflow |
| Phase status | `CLOSED` — architect re-review `PASS` (2026-10-01) on the reviewed correction `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884`; the phase was closed by that `PASS` (only `PASS` closes a phase — D-009/D-020); issue I-013 is `RESOLVED`; Phase 7 has NOT started (only ChatGPT may authorize Phase 7) |
| Review outcome that produced this correction | `CORRECTION_REQUIRED` — the architect's first review of the Phase 6 implementation, 2026-10-01; reviewed commit `c0cca964064286c25dcf22c8f86038baaacd7ebe` ("docs: establish phase 6 correction and issue control") |
| Phase contract | `docs/project-control/CURRENT_PHASE.md` |

### 4. Baseline commit

| Field | Value |
|---|---|
| Correction baseline | `c0cca964064286c25dcf22c8f86038baaacd7ebe` — the Phase 6 implementation commit (parent `f62326dbe1940a2a518567d66e720a4b407dbf26`). The developer verified per Part I §I.6 before executing: branch `feature/ai-core-from-doable-source`; HEAD = origin tip = `c0cca964`; clean working tree; mainlines unchanged; `b65725e5` ancestry intact; `vercel.json` unchanged. The correction commit must be the direct child of this baseline |

### 5. Architect

**ChatGPT** — architect / technical lead / reviewer / controller. Only the architect may issue this corrective handoff, re-review the correction, and resolve the related issue.

### 6. Developer

**Z.AI** — developer / implementer. Executes only the corrective scope; self-verifies; records evidence; commits; pushes; reports; and STOPs at the correction boundary.

### 7. Finding

The Phase 6 issue-control system introduced a P2/P3 exception path inconsistent with the already-established Phase 5 closure-eligibility contract. In `ISSUES.md` and the Phase 6 contract, an acceptance-violating P2/P3 is correctly described as closure-blocking while unresolved, but the implementation then permits such an issue to remain unresolved if covered by a recorded architect-approved exception. This creates a new closure exception mechanism for unresolved blocking P2/P3 issues. The Phase 5 verification contract does not define such an exception. Phase 5 R6 requires "no unresolved blocking correction is open" — therefore an acceptance-violating P2/P3 that remains unresolved is still a blocking correction and cannot become closure-compatible merely because an exception is recorded.

### 8. Evidence

- [architect-verified] The architect's corrective handoff on the Phase 6 implementation (2026-10-01): review outcome `CORRECTION_REQUIRED`; correction baseline `c0cca964064286c25dcf22c8f86038baaacd7ebe`; the finding (§7 above) and the required canonical rule (§10 below) as communicated by ChatGPT. No repository commands are claimed on ChatGPT's behalf.
- [developer-reported, Git-verifiable] The contradictory wording as delivered at `c0cca964`: `ISSUES.md` §1 severity model, P2 row — "it may be cleared only by resolution (`RESOLVED`) or by an explicitly recorded architect-approved exception (the same `DECISIONS.md` mechanism …)"; P3 row — "if acceptance-violating, it blocks while unresolved unless resolved or covered by a recorded architect-approved exception"; `VERIFICATION_STATE.md` §"Correction and issue-control workflow" R6 mapping — "P2/P3 iff the issue violates an acceptance criterion … without a recorded architect-approved exception"; `CURRENT_PHASE.md` correction-workflow model summary — "then they block while unresolved unless resolved or covered by a recorded architect-approved exception"; `verification/correction-cycle-test.sh` — the P2/P3 blocking branch conditioned on `[ "$exceptioned" -eq 0 ]`.

### 9. Why the finding blocks acceptance

The Phase 5 contract is canonical and already binding (D-020): R5 = P1 count is zero, or every P1 has an approved exception; R6 = no unresolved blocking correction is open. An acceptance-violating P2/P3 is explicitly classified by Phase 6 as a blocking issue; therefore, while unresolved, R6 fails and the phase cannot close. The Phase 6 workflow is contractually forbidden from creating a second verification system or bypassing R1–R7 (`VERIFICATION_STATE.md` §"Correction and issue-control workflow"), so there must not be an additional Phase 6 rule that bypasses R6. The contradiction also violates the Phase 6 acceptance criteria requiring P0/P1 behavior to remain consistent with Phase 5 (the severity model's closure semantics must not contradict the closure-eligibility contract) — hence the phase could not receive `PASS` until corrected.

### 10. Exact correction required

Correct the Phase 6 policy to the canonical rule:

> **P2/P3 do not automatically block phase closure. If a P2/P3 violates an active phase acceptance criterion or another explicit blocking condition, it becomes a blocking issue and remains closure-blocking while unresolved. Phase 6 introduces no P2/P3 exception mechanism.**

The severity distinction must remain:

- **P0** — P0 always blocks phase closure. No exception path exists. (Unchanged.)
- **P1** — P1 blocks `PASS` unless the existing Phase 5 architect-approved P1 exception mechanism applies. (Unchanged.)
- **P2/P3** — P2/P3 do not automatically block closure. If acceptance-violating or otherwise explicitly blocking, they block while unresolved. They must be resolved before closure. Phase 6 does not introduce a P2/P3 exception path.

Do not weaken the existing P0 or P1 rules. Do not create or imply any P0 exception, P2 exception, P3 exception, generic severity exception, or blocking-correction exception. The issue lifecycle remains unchanged — the correction is about **closure semantics for P2/P3**, not the lifecycle. The correction must be traceable in the issue-control system (issue record; this CH-001 instance), and the deterministic test must be corrected to prove the semantics.

### 11. Approved correction scope

| Path | Action | Bounded change |
|---|---|---|
| `docs/project-control/ISSUES.md` | modify | The severity-model wording (P2/P3 closure-effect rows; the P1 row's only-exception clarifier; the §4 status-relationship row) + the I-013 canonical issue record; legacy entries I-001…I-012 preserved unrewritten |
| `docs/project-control/VERIFICATION_STATE.md` | modify | The R6-mapping wording (§"Correction and issue-control workflow"); the Phase 6 corrective-cycle records (intro, implementation-state/correction rows, review trail, outstanding state); the state-machine consistency table; the appendix Phase 6 command block |
| `docs/project-control/CURRENT_PHASE.md` | modify | The severity-model summary (correction-workflow model); the current-state wording (phase state, Phase identity, baseline, verification requirements, git constraints) |
| `docs/project-control/verification/correction-cycle-test.sh` | modify | The P2/P3 blocking determination (exception flag no longer clears an acceptance-violating P2/P3); severity-edge fixtures proving the corrected semantics; comments; no P0-case or P1-exception-model change |
| `docs/project-control/ZAI_HANDOFF.md` | modify | Part II replaced with this CH-001 corrective-handoff instance (per Part I §I.5/§I.12); Part I untouched |
| `worklog.md` | modify | The Phase 6 corrective-cycle note appended (append-only; the implementation entry unrewritten) |
| `docs/project-control/sessions/SESSION-009.md` | create | The Phase 6 correction session record (per the sessions conventions) |
| `docs/project-control/sessions/README.md` | modify | The SESSION-009 index row |
| `docs/project-control/PROJECT_STATE.md` | modify | Consequential current-state reconciliation only (the durable state must distinguish the Phase 6 implementation commit from the Phase 6 correction commit with the architect re-review PENDING — entailed by the Final State Contract consistency requirement, per the established Phase 4/5/6 reconciliation convention) |
| `docs/project-control/NEXT_ACTION.md` | modify | Consequential current-state reconciliation only (same entailment) |

### 12. Explicit non-scope

- No product code (`src/**`, `packages/**`), no dependencies, no database schema/migrations, no Supabase mutations, no Vercel operations, no `vercel.json` changes.
- No production-branch work (`Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`); no force-push; no rewriting/amending/reverting of `b65725e5` or any historical commit.
- No immutable Doable-source trees (`docs/doable-source/doable-source/**`, `docs/doable-source/dependency-closure/**`, `docs/doable-source/ui-reference/**`).
- No unrelated control-document changes; no unrelated issues fixed; no unrelated refactoring; no architecture changes outside this handoff; no silently altered acceptance criteria; no issue-lifecycle redesign; no weakening of the P0 or P1 rules.
- No next-phase work or artifacts; no product-feature specifications or implementation plans (no Multi-Provider, Unified Tool Runtime, Integrations, MCP, Agent Runtime, Agent Work Mode, Memory, Skills, analytics, usage monitoring, voice/RAG implementation).
- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads introduced anywhere.
- No R-3/R-4/R-5 resolution and no credential rotation.
- No rewriting of historical records (`SESSION-008.md`, the `worklog.md` Phase 6 implementation entry, the Phase 6 validation history, the Phase 0–5 records).

### 13. Required reading

1. The related issue record — `ISSUES.md` §"Issue records (canonical schema)" (I-013) + §"Issue-control system" (severity model; lifecycle; schema; status relationship; traceability);
2. `VERIFICATION_STATE.md` — §"Verification and phase-gate contract" (esp. closure eligibility R1–R7 and the P0/P1 blocker rule), §"Correction and issue-control workflow" (the R6 mapping), §Phase 6 (the evidence section and the review trail);
3. The canonical correction-handoff form — `templates/CORRECTION_HANDOFF_TEMPLATE.md` (the 22 sections; integrity rules);
4. `CURRENT_PHASE.md` (the Phase 6 contract) and this file's Part I (esp. §I.5, §I.6, §I.8, §I.9, §I.12);
5. The affected documents: `ISSUES.md` §1 severity rows; `VERIFICATION_STATE.md` R6 mapping; `CURRENT_PHASE.md` severity summary; `verification/correction-cycle-test.sh`;
6. The Phase 5 P0 correction precedent (`fb4ad5f5`; `SESSION-006.md` corrective note; the `worklog.md` Phase 5 correction note) — the established correction-recording conventions;
7. `sessions/README.md` (the session-record conventions) and repository-root `worklog.md` (§3.1 append-only convention).

### 14. Implementation tasks (numbered, deterministic)

1. Complete the mandatory initialization (Required reading above; repository refresh per Part I §I.6 — verify branch `feature/ai-core-from-doable-source`, HEAD = origin tip = `c0cca964`, clean tree, mainlines unchanged, `b65725e5` ancestry intact, `vercel.json` unchanged; if the baseline has moved unexpectedly: STOP).
2. Correct the canonical severity model in `ISSUES.md` §1 — the P2/P3 closure-effect rows state the canonical rule (no P2/P3 exception mechanism; resolution required); the P1 row's parenthetical clarifies P0 and P2/P3 have no exception; the §4 status-relationship row carries the same clarification. Legacy entries untouched.
3. Correct the R6 mapping in `VERIFICATION_STATE.md` §"Correction and issue-control workflow" — remove the "without a recorded architect-approved exception" qualifier from the P2/P3 blocking determination; state that Phase 6 introduces no P2/P3 exception mechanism.
4. Correct the severity-model summary in `CURRENT_PHASE.md` (correction-workflow model) — same canonical rule.
5. Create the issue record I-013 in `ISSUES.md` §"Issue records (canonical schema)" per the full 22-field schema (severity P1; status advanced to `REVIEW_PENDING` at submission; architect review status `pending`).
6. Correct the deterministic model in `verification/correction-cycle-test.sh` — the P2/P3 blocking determination ignores the exception flag; add fixtures proving: non-acceptance-violating P2/P3 do not automatically block closure; acceptance-violating P2 and P3 block; an unresolved acceptance-violating P2/P3 with an alleged architect exception remains closure-ineligible (FAIL). Do not alter the P0 cases; do not alter the P1 exception model; the test still models state transitions only and claims no actual architect review.
7. Record the corrective cycle in `VERIFICATION_STATE.md` §Phase 6 (the correction rows, the architect-review-trail entry for the `CORRECTION_REQUIRED` outcome + CH-001 issuance, the correction-validation table, the outstanding re-review state) and reconcile the state-machine consistency table.
8. Replace Part II of this file with this CH-001 instance (per §I.12; the Phase 6 implementation instance is superseded — recoverable at `c0cca964`).
9. Consequential current-state reconciliation: `PROJECT_STATE.md` and `NEXT_ACTION.md` updated to the corrective-cycle state (Phase 6 `IN_PROGRESS`; implementation reviewed → `CORRECTION_REQUIRED`; correction submitted, developer-reported; architect re-review PENDING; issue I-013 open at `REVIEW_PENDING`).
10. Apply the audit updates: append the `worklog.md` corrective-cycle note (append-only; the Phase 6 implementation entry unrewritten); create `sessions/SESSION-009.md` + its `sessions/README.md` index row.
11. Execute the validation suite (§17); record commands and results in `VERIFICATION_STATE.md` §Phase 6 correction validation.
12. Commit as `docs: correct phase 6 p2 p3 closure policy` — the immediate child of `c0cca964`; push to `origin/feature/ai-core-from-doable-source`; verify clean status and sync.
13. Deliver the developer-reported correction completion report (§20) and STOP.

### 15. Interfaces / contracts

- **Control-document contracts** (Phase 1): required fields and headings intact; only dated state values and the corrected closure semantics reconciled.
- **Final State Contract** (plan): `PROJECT_STATE.current_phase` = `CURRENT_PHASE.phase` = `NEXT_ACTION.phase` = `ZAI_HANDOFF.phase` (this Part II Phase identity) = `VERIFICATION_STATE.phase` = latest worklog phase = **Phase 6 — Correction and Issue-Control Workflow, `IN_PROGRESS`** — with the corrective-cycle state recorded consistently (implementation reviewed → `CORRECTION_REQUIRED`; correction submitted, developer-reported; architect re-review PENDING; issue I-013 `REVIEW_PENDING`).
- **Verification and phase-gate contract** (Phase 5; D-020): unchanged and binding — Gates A–F, applicability, review-outcome semantics, the P0/P1 blocker rule, closure eligibility R1–R7. **R6 remains authoritative for unresolved blocking corrections.**
- **Issue-control system** (Phase 6; canonical in `ISSUES.md`): the issue lifecycle vocabulary and severity model P0–P3 with the corrected P2/P3 closure semantics — distinct from, and deterministically related to, the phase-status vocabulary (D-011). The lifecycle itself is unchanged.
- **Status vocabulary** (D-011) and **evidence classes** (D-012): unchanged and binding.
- **`b65725e5` handling rules** (standing): accepted as an already-existing repository event; not rewritten/reverted/amended; `vercel.json` non-scope; provenance reported as not independently established.
- **Handoff integrity** (D-017 / Part I §I.6): unchanged and binding for this instance.

### 16. Security constraints

- No secrets, credentials, access tokens, private chain-of-thought, or sensitive runtime payloads may be written (the R-5 Vercel token is referenced but never reproduced).
- No fabricated timestamps; no unsupported claims; observable evidence only.
- Tenancy boundaries and authorization requirements: documentation-only — no application security surface.
- Immutable-source boundaries (D-007) and production-branch restrictions (D-008) remain in force; no deployment operations; no force-push.

### 17. Testing requirements (validation before commit)

| # | Check | Method | Expected evidence |
|---|---|---|---|
| 1 | Model config | `npm run validate:model-config` | PASS (lightweight check — explicitly not interpreted as sufficient correction verification) |
| 2 | Corrected correction-cycle test | `bash docs/project-control/verification/correction-cycle-test.sh` | **24/24 determinations correct, exit 0** — including: P2 unresolved + non-acceptance-violating → does not automatically block closure (PASS); P2 unresolved + acceptance-violating → closure FAIL; P3 unresolved + acceptance-violating → closure FAIL; acceptance-violating P2/P3 + unresolved + architect exception → **closure FAIL** (rejected); P0 cases unaltered; P1 exception model unaltered |
| 3 | Phase 5 regression | `bash docs/project-control/verification/phase-closure-eligibility-test.sh` | **8/8 determinations correct, exit 0**; P0 present → closure eligibility FAIL (case-3) |
| 4 | Canonical-rule presence | `rg -n 'Phase 6 introduces no P2/P3 exception mechanism' docs/project-control/{ISSUES,VERIFICATION_STATE,CURRENT_PHASE}.md` | present in all three carriers |
| 5 | Semantic-contradiction absence | repository-wide search for the old semantic patterns (`P2/P3 exception`, `acceptance-violating P2/P3 … exception`, `P2 exception`, `P3 exception`, `blocking P2/P3 … architect-approved exception`) | no live rule carries the exception semantics; remaining occurrences are historical finding quotations (the I-013 record, corrective-cycle evidence, review trail, worklog/session notes) |
| 6 | P0/P1 rules + lifecycle unchanged | diff vs `c0cca964` on the P0/P1 rows and `ISSUES.md` §2; the P0/P1 blocker rule in `VERIFICATION_STATE.md` | byte-identical rule bodies (P1 row's parenthetical clarifier is the only P1-row touch) |
| 7 | Legacy issue entries preserved | `git diff c0cca964 -- docs/project-control/ISSUES.md` | I-001…I-012 byte-identical; additions only |
| 8 | Changed-path scope check | `git show --name-only --format=HEAD` | every changed path within `worklog.md` + `docs/project-control/**` |
| 9 | Immutable-source / production-branch check | diff vs `c0cca964` on protected paths; ref check | immutable trees untouched; production refs unchanged; no force-push; `b65725e5` ancestry intact |
| 10 | Secret-pattern scan | credential/token patterns across all changed paths | no matches |
| 11 | Final State Contract consistency | cross-member phase/status check | Phase 6 `IN_PROGRESS` + the corrective-cycle state agree across the five members + the worklog |
| 12 | Git hygiene | `git status --porcelain`; `git rev-parse HEAD origin/feature/ai-core-from-doable-source` | clean tree after commit; local = origin after push; the commit is the immediate child of `c0cca964` |

The reusable aggregate correction-validation script stays outside the repository (`/home/z/my-project/scripts/validate-phase6-p2p3-correction.sh`, staged + post-commit HEAD modes), per the Phase 3/4/5 convention.

### 18. Acceptance criteria (pass/fail — evaluated by the architect at re-review)

1. P0 remains unconditionally closure-blocking — PASS/FAIL.
2. P1 retains the existing Phase 5 exception mechanism — PASS/FAIL.
3. P2/P3 do not automatically block closure — PASS/FAIL.
4. Acceptance-violating P2/P3 are explicitly closure-blocking while unresolved — PASS/FAIL.
5. No P2/P3 exception mechanism exists — PASS/FAIL.
6. R6 remains authoritative for unresolved blocking corrections — PASS/FAIL.
7. The Phase 6 issue-control system does not contradict Phase 5 — PASS/FAIL.
8. The deterministic test proves non-acceptance-violating P2/P3 are non-blocking — PASS/FAIL.
9. The deterministic test proves acceptance-violating P2/P3 are blocking — PASS/FAIL.
10. The deterministic test rejects an unresolved acceptance-violating P2/P3 with an alleged exception — PASS/FAIL.
11. The Phase 5 regression remains 8/8 — PASS/FAIL.
12. No unrelated lifecycle semantics are changed — PASS/FAIL.
13. No unrelated project-control documents are modified — PASS/FAIL.
14. No product/DB/deployment/immutable-source changes occur — PASS/FAIL.
15. Evidence is classified correctly — PASS/FAIL.
16. Phase 6 remains `IN_PROGRESS` — PASS/FAIL.
17. Architect review remains `PENDING` — PASS/FAIL.
18. The correction is recorded in the issue-control system — PASS/FAIL.
19. Worklog history is append-only — PASS/FAIL.
20. Final State Contract remains consistent — PASS/FAIL.
21. Working tree is clean — PASS/FAIL.
22. Local branch is synchronized with origin — PASS/FAIL.

### 19. Git requirements

- Permitted branch: `feature/ai-core-from-doable-source` only; never `Vercel-Prod`, `Vercel-Preview`, `Vite-Converted`, `main`; no force-push.
- One focused correction commit: `docs: correct phase 6 p2 p3 closure policy` — the immediate child of the correction baseline `c0cca964064286c25dcf22c8f86038baaacd7ebe`; changed paths limited to the approved correction scope (§11); no unrelated changes ride along; no squashing of unrelated history. If the baseline has moved unexpectedly: STOP — do not rebase or force-push without a refreshed architect handoff.
- Push normally to `origin/feature/ai-core-from-doable-source`; do not amend the baseline or the Phase 6 implementation commit.

### 20. Evidence requirements

The developer-reported correction completion report (per Part I §I.7 and the architect's corrective handoff §19) must provide: the issue ID (I-013); the correction ID (CH-001); the finding (the P2/P3 closure-exception contradiction); the baseline (`c0cca964064286c25dcf22c8f86038baaacd7ebe`); the exact changed-file list; the canonical rule after correction; confirmation that P0 and P1 are unchanged; the corrected P2/P3 semantics; the deterministic correction-cycle test result; the Phase 5 regression result; the model-config result; other validation results; the correction commit SHA; working tree CLEAN; remote SYNCED; architect review PENDING. All reported as developer-reported evidence until the architect re-reviews — no `PASS` claimed, no `RESOLVED` claimed, no phase closure claimed.

### 21. Review boundary

**Developer correction submission does not equal issue resolution, and neither equals phase completion.**

**Only ChatGPT/project-owner architect review can resolve the issue (`RESOLVED`) and close the phase.**

After the correction commit, push, and evidence report: the issue moves `CORRECTION_SUBMITTED` → `REVIEW_PENDING` (registered), and the phase remains open awaiting the architect's re-review. The re-review is Gate D under the verification and phase-gate contract (`VERIFICATION_STATE.md` §contract) — architect-only. Only an actual ChatGPT re-review may produce `architect-verified` resolution evidence. Possible re-review outcomes: `PASS` (the issue may become `RESOLVED` and the phase may close if all Phase-Gate conditions hold), `PASS_WITH_FOLLOWUP` (phase stays open with recorded follow-ups), `CORRECTION_REQUIRED` (a further corrective handoff — the issue returns to issue-status `CORRECTION_REQUIRED`; repeat cycle). Z.AI must not choose the outcome.

### 22. STOP boundary

The correction boundary and the closure were both reached on 2026-10-01: the correction was delivered, re-reviewed `PASS`, and the issue resolved (I-013 → `RESOLVED`); Phase 6 was closed by that `PASS`. After the closure-record commit (`docs: record architect approval of phase 6`, the immediate child of `4dc8a573`), its push, and the closure report: **Z.AI STOPs at the inter-phase boundary.** Until the architect reviews the closure record and issues the next explicit handoff, Z.AI must NOT:

1. start the next phase (Phase 7 or any later phase) or create next-phase artifacts, templates, marketplace, or automation;
2. implement unrelated improvements or fix unrelated issues;
3. make architectural decisions outside any authorized scope;
4. deploy unless explicitly authorized; modify production (branches, database, deployment configuration);
5. silently expand any authorized scope or absorb newly discovered out-of-scope issues into it.

**If a newly discovered issue is outside any authorized scope: STOP → record/report it (a new `ISSUES.md` record, `[developer-reported]`, awaiting architect triage) → await architect direction.**

**Only ChatGPT may authorize Phase 7.**

### Closure record (2026-10-01)

**Architect re-review of the corrected Phase 6 state — outcome `PASS` → Phase 6 `CLOSED`; issue I-013 → `RESOLVED`.** Architect: **ChatGPT**. Developer: **Z.AI**. Reviewed correction commit: `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884` ("docs: correct phase 6 p2 p3 closure policy" — the corrected Phase 6 state; the immediate child of the Phase 6 implementation commit `c0cca964064286c25dcf22c8f86038baaacd7ebe`; verified relationship `c0cca964 → 4dc8a573`; correction baseline `c0cca964` preserved). The architect's first review of the Phase 6 implementation (2026-10-01) returned `CORRECTION_REQUIRED` — the P2/P3 closure-exception contradiction (issue I-013, this corrective handoff CH-001); the corrective commit delivered the correction; the architect's re-review of the corrected state returned `PASS`. Scope verification: documentation-only. The corrected state satisfies the Phase 6 acceptance criteria — the canonical P2/P3 rule is unambiguous and consistent with Phase 5 R6 (**P2/P3 do not automatically block phase closure; if acceptance-violating or otherwise explicitly blocking, they block while unresolved and must be resolved before closure; Phase 6 introduces no P2/P3 exception mechanism** — the P2/P3 contradiction is resolved), the P0 rule (unconditionally closure-blocking; no exception path) and the P1 exception mechanism are unchanged, the issue lifecycle is unchanged, and the corrected deterministic test proves the semantics (24/24 determinations correct, exit 0 — including the rejection of an unresolved acceptance-violating P2/P3 with an alleged architect-approved exception; Phase 5 regression 8/8 with P0 present → closure eligibility FAIL). Issue I-013 disposition: **`RESOLVED`** — recorded with `[architect-verified]` resolution evidence in `ISSUES.md` §"Issue records (canonical schema)". The closure handoff supplies no separate review timestamp; none is fabricated. [architect-verified — as communicated by the architect in the Phase 6 closure handoff]

**Phase 7 is the next phase (per the plan) and the next authorized phase; it has NOT started.** No Phase 7 handoff has been issued; no Phase 7 implementation has been performed; no product implementation has been performed. [architect-verified]

This instance is fully executed and its phase is closed; it remains materialized here until the architect issues the Phase 7 handoff, at which point Part II is replaced with the Phase 7 instance per §I.12 (this instance remains recoverable in Git history at the closure-record commit and in the canonical `worklog.md`). The closure record itself is committed as `docs: record architect approval of phase 6` — the immediate child of `4dc8a573` — and records the architect's approval; the closure-record commit is **not** the reviewed correction (the reviewed correction is `4dc8a5733e19c5eb47e2be6d2df77aa4f0dd5884`; its SHA is not replaced by the closure-record SHA in any field identifying the reviewed correction). The `b65725e5` handling rules above remain in force: provenance not independently established (never described as confirmed owner authorship); not modified, amended, reverted, or rewritten; `vercel.json` non-scope. The historical Phase 6 worklog entry is preserved unrewritten; the closure appears as a subsequent append-only architect-verified event. Z.AI is STOPped at the inter-phase boundary — awaiting the ChatGPT architect's review of the closure record and the explicit Phase 7 handoff. [developer-reported]
